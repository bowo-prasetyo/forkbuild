// Shown above every screen whose route is marked `meta: { experimental: true }`
// (see ui/router/index.js): the anchoring settings, leaderboard and
// reconciliation areas. They work, but are not part of what ForkBuild commits
// to keeping stable. The Publications page is not such a route: it marks its
// own Experimental parts with an .experimental-badge.
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
