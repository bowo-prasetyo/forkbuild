export default {
    name: 'HomeView',
    template: `
        <section class="home-view">
            <h1>ForkBuild</h1>
            <p class="tagline">Build. Fork. Share. Evolve.</p>
            <p>
                An open-source, browser-based, decentralized building game.
                Creations are stored using interchangeable publishing providers.
            </p>
            <router-link to="/editor" class="cta-button">Start Building</router-link>
            <img src="favicon.svg" alt="BuildFork icon">
        </section>
    `
};
