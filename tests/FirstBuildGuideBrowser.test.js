// @environment browser
import { createApp, nextTick, reactive } from 'vue';
import FirstBuildGuide from '../ui/components/FirstBuildGuide.js';
import { FIRST_BUILD_STEPS, normalizeFirstBuildProgress } from '../core/challenge/FirstBuildChecklist.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// The guided first build's card, rendered by real Vue with the shipped CSS:
// the steps with the next one's hint, folding to a small button, hiding, and
// the finish with its celebration.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

function mount(completed, walkRoute = null, quiet = false, placing = false) {
    const events = [];
    const host = document.createElement('div');
    host.style.cssText = 'position: relative; width: 900px; height: 600px;';
    document.body.appendChild(host);
    const state = reactive({ progress: normalizeFirstBuildProgress({ completed }), walkRoute, quiet, placing });
    const app = createApp({
        components: { FirstBuildGuide },
        setup: () => ({ state, events }),
        template: `<FirstBuildGuide :progress="state.progress" :walk-route="state.walkRoute" :quiet="state.quiet" :placing="state.placing" @dismiss="events.push('dismiss')" @celebrated="events.push('celebrated')" />`
    });
    // The test page has no router; a plain link stands in for router-link.
    app.component('router-link', { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : to.path + \'?arrive=\' + to.query.arrive"><slot /></a>' });
    app.mount(host);
    return { host, events, state, unmount: () => { app.unmount(); host.remove(); } };
}

// While a starter job is open it is the one tutor: the guide folds to its
// small button, and opens again once the job is done.
{
    const { host, state, unmount } = mount(['place-brick'], null, true);
    await nextTick();
    assert(host.querySelector('.first-build-guide-pill') && !host.querySelector('.first-build-guide'), 'quiet, the guide is only its small button');
    state.quiet = false;
    await nextTick();
    assert(host.querySelector('.first-build-guide') && !host.querySelector('.first-build-guide-pill'), 'the job done, it opens again');
    state.quiet = true;
    await nextTick();
    assert(host.querySelector('.first-build-guide-pill'), 'and folds when another job opens');
    host.querySelector('.first-build-guide-pill').click();
    await nextTick();
    assert(host.querySelector('.first-build-guide'), 'its button still opens it on request');
    unmount();
    console.log('✓ quiet while a starter job teaches, open again after');
}

// "Add something of your own" is the third step; a device that had dropped a
// structure in keeps it done.
{
    const { host, unmount } = mount(['place-brick', 'stack']);
    await nextTick();
    const own = host.querySelector('.first-build-step[data-step="own"]');
    assert(own && own.textContent.includes(t('firstBuild.step.own')) && own.getAttribute('aria-current') === 'step', 'the third step asks for something of your own');
    assert(host.querySelector('.first-build-hint').textContent.trim() === t('firstBuild.hint.own'), 'five bricks, anything, anywhere');
    unmount();
    const before = mount(['place-brick', 'stack', 'structure']);
    await nextTick();
    assert(before.host.querySelector('.first-build-step[data-step="own"]').classList.contains('first-build-step--done'), 'a structure dropped in before the change keeps the step done');
    before.unmount();
    console.log('✓ the third step: add something of your own');
}

// The steps, the one to do next and its hint.
{
    const { host, events, state, unmount } = mount(['place-brick']);
    await nextTick();
    const steps = [...host.querySelectorAll('.first-build-step')];
    assert(steps.map((step) => step.dataset.step).join() === FIRST_BUILD_STEPS.join(), 'every step, in order');
    assert(steps[0].classList.contains('first-build-step--done') && steps[1].getAttribute('aria-current') === 'step', 'the first done, the second current');
    assert(host.querySelector('.first-build-hint').textContent.trim() === t('firstBuild.hint.stack'), 'the hint is for stacking');
    assert(host.querySelector('.first-build-count').textContent.includes('1'), 'it counts what is done');
    const card = host.querySelector('.first-build-guide');
    const box = card.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    assert(getComputedStyle(card).position === 'absolute' && box.left - hostBox.left < 40 && hostBox.bottom - box.bottom < 40, `it sits at the bottom left of the viewport (${box.left - hostBox.left}, ${hostBox.bottom - box.bottom})`);

    state.progress = normalizeFirstBuildProgress({ completed: ['place-brick', 'stack', 'structure'] });
    await nextTick();
    assert(host.querySelector('.first-build-hint').textContent.trim() === t('firstBuild.hint.save'), 'progress moves the hint on');

    host.querySelector('.first-build-icon-btn').click();
    await nextTick();
    const pill = host.querySelector('.first-build-guide-pill');
    assert(pill && !host.querySelector('.first-build-steps') && pill.textContent.includes(`3/${FIRST_BUILD_STEPS.length}`), 'folded, a small button says how far along');
    pill.click();
    await nextTick();
    host.querySelector('.first-build-link-btn').click();
    assert(events.join() === 'dismiss', 'Hide guide asks to hide it');
    unmount();
    console.log('✓ the steps, the next one\'s hint, folding and hiding');
}

// While Place is on it shrinks to the next step's hint, so it covers far less
// of the build; + shows every step, and it opens in full once placing stops
// (finding P2-11 of docs/reviews/EditorPlacementUX-2026-10-27.md).
{
    const { host, state, unmount } = mount(['place-brick']);
    await nextTick();
    const fullHeight = host.querySelector('.first-build-guide').getBoundingClientRect().height;
    state.placing = true;
    await nextTick();
    const compact = host.querySelector('.first-build-guide--compact');
    assert(compact && !host.querySelector('.first-build-steps'), 'placing, the card has no step list');
    assert(compact.querySelector('.first-build-hint').textContent.trim() === t('firstBuild.hint.stack'), 'but still the next step\'s hint');
    assert(compact.dataset.current === 'stack' && compact.textContent.includes(t('firstBuild.count', { done: 1, total: FIRST_BUILD_STEPS.length })), 'and how far along');
    const compactHeight = compact.getBoundingClientRect().height;
    assert(compactHeight < fullHeight / 2, `it is less than half as tall (${Math.round(compactHeight)} of ${Math.round(fullHeight)}px)`);
    state.progress = normalizeFirstBuildProgress({ completed: ['place-brick', 'stack'] });
    await nextTick();
    assert(host.querySelector('.first-build-guide--compact').dataset.current === 'own', 'a step done while placing moves it on to the next hint');
    host.querySelector('.first-build-expand-btn').click();
    await nextTick();
    assert(host.querySelector('.first-build-steps') && !host.querySelector('.first-build-guide--compact'), '+ shows every step');
    state.placing = false;
    await nextTick();
    state.placing = true;
    await nextTick();
    assert(host.querySelector('.first-build-guide--compact'), 'and placing again, it shrinks again');
    host.querySelector('.first-build-icon-btn').click();
    await nextTick();
    assert(host.querySelector('.first-build-guide-pill'), '– folds it to its small button');
    host.querySelector('.first-build-guide-pill').click();
    await nextTick();
    assert(host.querySelector('.first-build-steps'), 'which, asked for, opens every step even while placing');
    state.placing = false;
    await nextTick();
    assert(host.querySelector('.first-build-steps'), 'placing done, it stays open in full');
    unmount();
    console.log('✓ while placing, only the next step\'s hint');
}

// Walking inside is last: once the build is published, its hint has a button.
{
    const shared = FIRST_BUILD_STEPS.filter((step) => step !== 'walk-inside');
    const before = mount(shared);
    await nextTick();
    assert(before.host.querySelector('.first-build-hint').textContent.trim() === t('firstBuild.hint.walkInside'), 'the hint is for walking inside');
    assert(!before.host.querySelector('.first-build-walk'), 'no button before the build is published');
    before.unmount();
    const after = mount(shared, { path: '/world/doc-1', query: { arrive: 'door' } });
    await nextTick();
    const walk = after.host.querySelector('.first-build-walk');
    assert(walk && walk.textContent.trim() === t('firstBuild.walk') && walk.getAttribute('href') === '/world/doc-1?arrive=door', 'published: Walk inside it goes to its door');
    after.unmount();
    console.log('✓ walking inside comes last, with a way to its door');
}

// Finished: the celebration, and its two ways on.
{
    const { host, events, unmount } = mount(FIRST_BUILD_STEPS);
    await nextTick();
    const done = host.querySelector('.first-build-guide--done');
    assert(done && done.textContent.includes(t('firstBuild.doneTitle')), 'the finish is celebrated');
    assert(host.querySelectorAll('.first-build-confetti-piece').length === 12, 'with confetti');
    const piece = host.querySelector('.first-build-confetti-piece');
    assert(getComputedStyle(piece).animationName === 'first-build-confetti-fall', 'that falls');
    assert(host.querySelector('a[href="/repository"]'), 'it offers other builds to look at');
    host.querySelector('.first-build-actions .action-btn--primary').click();
    assert(events.join() === 'celebrated', 'Keep building says the finish was seen');
    unmount();
    console.log('✓ the finish is celebrated');
}
