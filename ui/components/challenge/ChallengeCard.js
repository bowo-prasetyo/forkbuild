import { challengeAt } from '../../../core/BuildChallenge.js';
import { challengeJoinRoute, challengeThemeBrief, challengeThemeTitle, challengeTimeText } from './challengeText.js';
import { t } from '../../i18n/i18n.js';

// This week's build challenge, on Home: the theme, how long is left, and the
// ways in (Join, which opens a starting build tagged for the week, and the
// challenge page with its entries).
export default {
    name: 'ChallengeCard',
    props: {
        // For tests; the challenge running now otherwise.
        now: { type: Number, default: null }
    },
    setup(props) {
        const now = props.now ?? Date.now();
        const challenge = challengeAt(now);
        return {
            t,
            challenge,
            title: challengeThemeTitle(challenge),
            brief: challengeThemeBrief(challenge),
            time: challengeTimeText(challenge, now),
            joinRoute: challengeJoinRoute(challenge),
            pageRoute: { path: '/challenge' }
        };
    },
    template: `
        <section class="challenge-card" aria-labelledby="challenge-card-title">
            <p class="challenge-card-kicker">
                <span aria-hidden="true">🏆</span> {{ t('challenge.weekly') }}
                <span class="challenge-card-time">{{ time }}</span>
            </p>
            <h2 id="challenge-card-title" class="challenge-card-title">{{ title }}</h2>
            <p class="challenge-card-brief">{{ brief }}</p>
            <p class="challenge-card-tag">#{{ challenge.tag }}</p>
            <div class="challenge-card-actions">
                <router-link :to="joinRoute" class="cta-button challenge-join">{{ t('challenge.join') }}</router-link>
                <router-link :to="pageRoute" class="home-cta-secondary challenge-see-entries">{{ t('challenge.seeEntries') }}</router-link>
            </div>
        </section>
    `
};
