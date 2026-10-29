// @environment browser
import { createApp, h, nextTick } from 'vue';
import WelcomeBack from '../ui/components/home/WelcomeBack.js';
import { challengeAt } from '../core/challenge/BuildChallenge.js';
import { assert } from './support/Assert.js';

// Home's Welcome back, rendered by real Vue: the way back to the build
// changed last, a nudge to publish or to enter this week's challenge, and
// nothing at all for a newcomer. Keep building is counted.

const NOW = Date.parse('2026-10-29T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

// A router-link that renders the address it would go to, as the hash router does.
const RouterLinkStub = {
    props: ['to'],
    computed: {
        href() {
            if (typeof this.to === 'string') return `#${this.to}`;
            const query = new URLSearchParams(this.to.query || {}).toString();
            return `#${this.to.path}${query ? `?${query}` : ''}`;
        }
    },
    template: '<a :href="href" @click.prevent><slot></slot></a>'
};

async function mount(welcome, now = NOW) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const counted = [];
    const app = createApp({ render: () => h(WelcomeBack, { welcome, now }) });
    app.component('router-link', RouterLinkStub);
    app.provide('funnelEventCounter', { keptBuilding: () => counted.push('keep-building') });
    app.mount(host);
    await nextTick();
    await nextTick();
    return { host, counted, unmount: () => { app.unmount(); host.remove(); } };
}

const build = (title, modified = NOW - 2 * DAY) => ({ documentId: 'doc-7', title, modified });

{
    const { host, counted, unmount } = await mount({ build: build('Cottage by the pond'), publishedBuilds: 0, enteredChallenge: false });
    assert(host.querySelector('#welcome-back-title').textContent === 'Welcome back', 'titled Welcome back');
    const keep = host.querySelector('.welcome-back-keep');
    assert(keep.textContent === 'Keep building "Cottage by the pond"', `names the build (${keep.textContent})`);
    assert(keep.getAttribute('href') === '#/editor?load=doc-7', `opens it in the Editor (${keep.getAttribute('href')})`);
    assert(host.querySelector('.welcome-back-lead').textContent.startsWith('Your build is saved on this device. Publish it'), 'nothing published yet: a nudge to publish');
    assert(host.querySelector('.welcome-back-changed').textContent === 'You last changed it 2 days ago.', 'when it was changed');
    const join = host.querySelector('.welcome-back-challenge');
    assert(join && join.textContent.startsWith('Join this week\'s challenge: '), 'this week\'s challenge, not yet entered');
    const challenge = challengeAt(NOW);
    assert(join.getAttribute('href').startsWith(challenge.kind === 'remix' ? `#/challenge/${challenge.id}` : '#/editor?challenge='), `Join goes where the challenge card's Join does (${join.getAttribute('href')})`);
    keep.click();
    assert(counted.join() === 'keep-building', 'Keep building is counted');
    unmount();
    console.log('✓ a returning builder is offered their last build and the week\'s challenge');
}

{
    const { host, unmount } = await mount({ build: build('', NOW - 60 * 1000), publishedBuilds: 3, enteredChallenge: true });
    assert(host.querySelector('.welcome-back-keep').textContent === 'Keep building', 'an untitled build: plain Keep building');
    assert(host.querySelector('.welcome-back-lead').textContent === 'You\'ve published 3 builds.', 'how many builds were published');
    assert(host.querySelector('.welcome-back-changed').textContent === 'You last changed it today.', 'changed today');
    assert(!host.querySelector('.welcome-back-challenge'), 'already entered: no challenge nudge');
    unmount();
    console.log('✓ a builder who entered this week isn\'t asked again');
}

{
    const { host, unmount } = await mount(null);
    assert(!host.querySelector('.welcome-back'), 'a newcomer sees nothing');
    unmount();
    console.log('✓ nothing for a newcomer');
}
