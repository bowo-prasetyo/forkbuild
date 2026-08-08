export default {
    name: 'App',
    template: `
        <div class="app-shell">
            <header class="app-header">
                <span class="app-title">ForkBuild</span>
                <nav class="app-nav">
                    <router-link to="/" class="app-nav-link">Home</router-link>
                    <router-link to="/editor" class="app-nav-link">Editor</router-link>
                    <router-link to="/repository" class="app-nav-link">Repository</router-link>
                    <router-link to="/about" class="app-nav-link">About</router-link>
                </nav>
            </header>

            <main class="app-content">
                <router-view />
            </main>
        </div>
    `
};
