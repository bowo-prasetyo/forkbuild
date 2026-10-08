// @environment browser
import { createApp, nextTick, reactive } from 'vue';
import FirstBuildGuide from '../ui/components/FirstBuildGuide.js';
import { FIRST_BUILD_STEPS, normalizeFirstBuildProgress } from '../core/FirstBuildChecklist.js';
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

function mount(completed) {
    const events = [];
    const host = document.createElement('div');
    host.style.cssText = 'position: relative; width: 900px; height: 600px;';
    document.body.appendChild(host);
    const state = reactive({ progress: normalizeFirstBuildProgress({ completed }) });
    const app = createApp({
        components: { FirstBuildGuide },
        setup: () => ({ state, events }),
        template: `<FirstBuildGuide :progress="state.progress" @dismiss="events.push('dismiss')" @celebrated="events.push('celebrated')" />`
    });
    // The test page has no router; a plain link stands in for router-link.
    app.component('router-link', { props: ['to'], template: '<a :href="to"><slot /></a>' });
    app.mount(host);
    return { host, events, state, unmount: () => { app.unmount(); host.remove(); } };
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
    assert(pill && !host.querySelector('.first-build-steps') && pill.textContent.includes('3/5'), 'folded, a small button says how far along');
    pill.click();
    await nextTick();
    host.querySelector('.first-build-link-btn').click();
    assert(events.join() === 'dismiss', 'Hide guide asks to hide it');
    unmount();
    console.log('✓ the steps, the next one\'s hint, folding and hiding');
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
