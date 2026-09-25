// Shown above every screen whose route is marked `meta: { experimental: true }`
// (see ui/router/index.js): the advanced publication, evidence, anchoring,
// leaderboard and reconciliation areas. They work, but are not part of what
// ForkBuild 1.0 commits to keeping stable.
export default {
    name: 'ExperimentalBanner',
    template: `
        <div class="experimental-banner" role="note">
            <strong>Experimental.</strong>
            This area works, but may change or be removed in a later version, and what it
            produces may not carry over. The core of ForkBuild (building, saving, publishing,
            forking, identities and peers) is not affected.
        </div>
    `
};
