// @environment browser — mounts the real SoundControl with Vue, in English and in the pseudo-locale.
import { createApp } from 'vue';
import SoundControl from '../ui/components/SoundControl.js';
import { setAppLocale } from '../ui/i18n/i18n.js';
import { PSEUDO_LOCALE, SOURCE_LOCALE } from '../ui/i18n/locales.js';
import { pseudoLocalize } from '../ui/i18n/pseudoLocalize.js';
import { assert } from './support/Assert.js';

function mount(props) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(SoundControl, props);
    app.mount(host);
    const read = () => ({
        group: host.querySelector('[role="group"]').getAttribute('aria-label'),
        toggle: host.querySelector('.world-view-sound-toggle'),
        volume: host.querySelector('.world-view-sound-volume'),
        spatial: host.querySelector('.world-view-sound-spatial')
    });
    return { read, unmount: () => { app.unmount(); host.remove(); } };
}

async function runTests() {
    const english = mount({ muted: false, spatial: true, showSpatial: true });
    const shown = english.read();
    assert(shown.group === 'Sound', 'the group is labelled in English');
    assert(shown.toggle.textContent.trim() === '🔊 Sound on', `the button reads in English (got ${shown.toggle.textContent})`);
    assert(shown.toggle.title === 'Turn sound off (M)', 'its tooltip too');
    assert(shown.volume.getAttribute('aria-label') === 'Volume', 'and the slider');
    assert(shown.spatial.textContent.trim() === '3D', 'and the 3D toggle');
    english.unmount();

    await setAppLocale(PSEUDO_LOCALE);
    const pseudo = mount({ muted: true });
    const pseudoShown = pseudo.read();
    assert(pseudoShown.toggle.textContent.trim() === pseudoLocalize('🔇 Sound off'), `the button is pseudo-localized (got ${pseudoShown.toggle.textContent})`);
    assert(pseudoShown.toggle.title === pseudoLocalize('Turn sound on (M)'), 'so is its tooltip');
    assert(pseudoShown.group === pseudoLocalize('Sound'), 'and the group label');
    pseudo.unmount();
    await setAppLocale(SOURCE_LOCALE);

    console.log('✓ SoundControl shows its text through t(), in English and in the pseudo-locale');
}

await runTests();
