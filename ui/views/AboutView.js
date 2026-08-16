import { VERSION } from '../../core/version.js';

export default {
    name: 'AboutView',
    setup() {
        const versionString = `${VERSION.major}.${VERSION.minor}.${VERSION.patch}`;
        return { versionString };
    },
    template: `
        <section class="about-view">
            <h1>About ForkBuild</h1>
            <p>Version {{ versionString }}</p>
            <p>
                ForkBuild is an open construction platform where digital creations
                can be built, forked, shared, and preserved across decentralized
                publishing systems.
            </p>
            <p>
                <a href="README.md" target="_blank" rel="noopener">Project README</a>
                — architecture, milestone history, and what's shipped so far.
            </p>
            <p>
                <a href="docs/user/README.md" target="_blank" rel="noopener">User Guide</a>
                — how to build, publish, fork, and explore in ForkBuild.
            </p>
        </section>
    `
};
