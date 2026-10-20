// @environment browser
import { createApp, nextTick, reactive } from 'vue';
import StarterJobCard from '../ui/components/StarterJobCard.js';
import { StarterCardStage } from '../core/challenge/StarterJob.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// The card a ready-made build carries, rendered by real Vue with the shipped
// CSS: the roof job, a first brick of the builder's own, then Publish; and
// over the 3D view, clear of the touch bar, when it floats on a phone.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

function mount(stage, floating = false) {
    const events = [];
    const host = document.createElement('div');
    host.style.cssText = 'position: relative; width: 390px; height: 700px;';
    document.body.appendChild(host);
    const state = reactive({ stage, floating });
    const app = createApp({
        components: { StarterJobCard },
        setup: () => ({ state, events }),
        template: `<StarterJobCard :stage="state.stage" :floating="state.floating" @pick="events.push('pick')" @publish="events.push('publish')" @hide="events.push('hide')" />`
    });
    app.mount(host);
    return { host, events, state, unmount: () => { app.unmount(); host.remove(); } };
}

const text = (host, selector) => host.querySelector(selector)?.textContent.trim();

// Each stage: what it says and the button it offers.
{
    const { host, events, state, unmount } = mount(StarterCardStage.JOB);
    await nextTick();
    assert(text(host, '.starter-job-title') === t('starterJob.roofTitle') && text(host, '.starter-job-pick') === t('starterJob.roofPick'), 'the roof job, with Pick the roof');
    host.querySelector('.starter-job-pick').click();

    state.stage = StarterCardStage.FIRST_EDIT;
    await nextTick();
    assert(text(host, '.starter-job-title') === t('starterJob.firstEditTitle') && text(host, '.starter-job-pick') === t('starterJob.firstEditPick'), 'no job: Make it yours, with Pick a tree');
    assert(!host.querySelector('.starter-job-publish'), 'no Publish before the build is theirs');
    host.querySelector('.starter-job-pick').click();

    state.stage = StarterCardStage.PUBLISH;
    await nextTick();
    const card = host.querySelector('.starter-job');
    assert(card.classList.contains('starter-job--done') && text(host, '.starter-job-title') === t('starterJob.doneTitle'), 'theirs now');
    assert(!host.querySelector('.starter-job-pick'), 'nothing left to pick');
    assert(text(host, '.starter-job-publish') === t('starterJob.publish') && host.querySelector('.starter-job-publish').classList.contains('action-btn--primary'), 'Publish it is the main button');
    host.querySelector('.starter-job-publish').click();
    host.querySelector('.starter-job-later').click();
    assert(events.join() === 'pick,pick,publish,hide', `each button says what was chosen (${events.join()})`);
    unmount();
    console.log('✓ the roof job, a first brick of their own, then Publish it or Keep building');
}

// In the sidebar it sits in the flow; floating, it is over the 3D view's
// bottom, above the touch bar, and opaque.
{
    const inSidebar = mount(StarterCardStage.FIRST_EDIT);
    await nextTick();
    assert(getComputedStyle(inSidebar.host.querySelector('.starter-job')).position === 'static', 'in the sidebar, in the flow');
    inSidebar.unmount();

    const floating = mount(StarterCardStage.FIRST_EDIT, true);
    await nextTick();
    const card = floating.host.querySelector('.starter-job');
    const style = getComputedStyle(card);
    const box = card.getBoundingClientRect();
    const hostBox = floating.host.getBoundingClientRect();
    assert(style.position === 'absolute' && box.left - hostBox.left <= 10 && hostBox.right - box.right <= 10, `floating, it spans the view (${box.left - hostBox.left}, ${hostBox.right - box.right})`);
    const fromBottom = hostBox.bottom - box.bottom;
    assert(fromBottom > 90 && fromBottom < 120, `above the touch bar (${fromBottom}px from the bottom)`);
    assert(/rgba?\(/.test(style.backgroundColor) && !style.backgroundColor.endsWith(', 0)'), `with a background of its own (${style.backgroundColor})`);
    floating.unmount();
    console.log('✓ in the sidebar on a wide screen, over the 3D view above the touch bar on a phone');
}
