// Shown above every screen whose route is marked `meta: { experimental: true }`
// (see ui/router/index.js): the anchoring settings. They work, but are not
// part of what ForkBuild commits to keeping stable. The Publications page is
// not such a route: it marks its own Experimental parts with an
// .experimental-badge.
import { t } from '../i18n/i18n.js';

export default {
    name: 'ExperimentalBanner',
    methods: { t },
    template: `
        <div class="experimental-banner" role="note">
            <strong>{{ t('experimentalBanner.experimental') }}</strong>
            {{ t('experimentalBanner.thisAreaWorksButMay') }}
        </div>
    `
};
