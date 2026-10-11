// @environment browser
import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import CollectionFamilies from '../ui/components/featured/CollectionFamilies.js';
import { assert } from './support/Assert.js';

// The app's example remix families (ui/components/featured/CollectionFamilies.js):
// each original with its remixes nested under it, every name a link that
// opens that build in the Editor as the visitor's own copy.

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { template: '<div></div>' } }] });
const host = document.createElement('div');
document.body.appendChild(host);
const app = createApp({ components: { CollectionFamilies }, template: '<CollectionFamilies />' });
app.use(router);
app.mount(host);
await router.isReady();
await nextTick();

{
    assert(host.querySelector('.remix-family-title').textContent.trim() === 'How remixes grow', 'the families have a title');
    const families = [...host.querySelectorAll('.collection-family')];
    assert(families.length === 3, `three families (got ${families.length})`);
    const originals = families.map((family) => family.querySelector('.collection-family-original').textContent.trim());
    assert(originals.join() === 'House,Watchtower,Mill', `each starts from its original (got ${originals.join()})`);
    const house = families[0];
    const nested = [...house.querySelectorAll('.remix-family-remixes .remix-family-remixes .remix-family-link')].map((link) => link.textContent.trim());
    assert(nested.join() === 'House with a Garden,House with a Tower', `remixes of remixes sit a level further in (got ${nested.join()})`);
    const links = [...host.querySelectorAll('a.remix-family-link')];
    assert(links.length === 10, `every build is a link (got ${links.length})`);
    assert(links.every((link) => /^\/editor\?start=(village|collection)(:|%3A)/.test(link.getAttribute('href'))),
        `each opens that build in the Editor as a copy (got ${links[0].getAttribute('href')})`);
    console.log('✓ the example families nest each remix under what it came from, each opening in the Editor');
}

app.unmount();
host.remove();
