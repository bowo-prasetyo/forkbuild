import { provide } from 'vue';
import UserWidget from './components/UserWidget.js';
import { CreatePreviewUseCase } from '../application/CreatePreviewUseCase.js';

export default {
    name: 'App',
    components: { UserWidget },
    // 0.2.32: one app-wide PreviewService, provided here (same
    // provide/inject convention LoginModal's identityUseCase already
    // uses) so its cache and generation queue survive navigating
    // between Repository, Author, and back — see
    // application/CreatePreviewUseCase.js.
    setup() {
        const { previewService } = new CreatePreviewUseCase().execute();
        provide('previewService', previewService);
    },
    template: `
        <div class="app-shell">
            <header class="app-header">
                <span class="app-title">ForkBuild</span>
                <div class="app-header-right">
	                <nav class="app-nav">
	                    <router-link to="/" class="app-nav-link">Home</router-link>
	                    <router-link to="/editor" class="app-nav-link">Editor</router-link>
	                    <router-link to="/repository" class="app-nav-link">Repository</router-link>
	                    <router-link to="/avatar" class="app-nav-link">My Avatar</router-link>
	                    <router-link to="/about" class="app-nav-link">About</router-link>
	                </nav>
                    <UserWidget />
                </div>
            </header>

            <main class="app-content">
                <router-view />
            </main>
        </div>
    `
};
