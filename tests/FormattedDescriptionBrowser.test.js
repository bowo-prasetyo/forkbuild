// @environment browser — mounts the description renderer with Vue.
import { createApp } from 'vue';
import FormattedDescription from '../ui/components/FormattedDescription.js';
import { assert } from './support/Assert.js';

function render(text) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(FormattedDescription, { text });
    app.mount(host);
    const html = host.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
    const root = host.firstElementChild;
    return { root, html, done: () => { app.unmount(); host.remove(); } };
}

async function runTests() {
    // The formatting a description may use becomes elements.
    const shown = render('Intro line\nsecond line\n\n## Materials\n- **Plinth:** grey *stone*\n- Posts');
    const blocks = Array.from(shown.root.children).map((element) => `${element.tagName}.${element.className}`);
    assert(blocks.join() === 'P.formatted-description-paragraph,P.formatted-description-heading,UL.formatted-description-list', `paragraph, heading, list (got ${blocks})`);
    assert(shown.root.querySelector('p br') && shown.root.firstElementChild.textContent === 'Intro linesecond line', 'a line break between a paragraph\'s lines');
    assert(shown.root.querySelector('li strong').textContent === 'Plinth:' && shown.root.querySelector('li em').textContent === 'stone', 'bold and italic');
    assert(shown.root.querySelectorAll('li').length === 2, 'two list items');
    shown.done();

    // Anything else stays text: no element, link or script comes from it.
    const hostile = render('<img src=x onerror="window.injected=1"> [link](https://evil.example) <script>window.injected=2</script>');
    assert(!hostile.root.querySelector('img, a, script') && hostile.root.textContent.includes('<img src=x') && !window.injected, 'HTML and links are shown as text');
    hostile.done();

    const plain = render('A plain description.');
    assert(plain.root.children.length === 1 && plain.root.textContent === 'A plain description.', 'a plain description is one paragraph, as before');
    plain.done();
    console.log('✓ descriptions show their formatting, and nothing else, as elements');
}

await runTests();
