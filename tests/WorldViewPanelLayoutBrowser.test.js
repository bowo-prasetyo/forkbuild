// @environment browser
import { createApp, nextTick } from 'vue';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import CollapsibleSection from '../ui/components/CollapsibleSection.js';
import { nearbySectionTemplate } from '../ui/views/worldView/templates/nearbySection.js';
import { worldListsSectionTemplate } from '../ui/views/worldView/templates/worldListsSection.js';
import { inspectionPanelsTemplate } from '../ui/views/worldView/templates/inspectionPanels.js';
import { hoverCardTemplate } from '../ui/views/worldView/templates/hoverCard.js';
import { WorldViewPrimaryMode } from '../application/world/WorldViewNavigationState.js';
import { assert } from './support/Assert.js';

// World View's left panel layout, rendered by real Vue in Chromium: the
// Nearby section's groups and camera actions, Worlds in View shown only
// when it adds something, the hover card kept out of the panel, and the
// host's Move Placement beside the Own Publication panel's Place action.

// The app's real stylesheet, so layout assertions see the shipped CSS.
await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

function mount(component, { route = null } = {}) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(component);
    if (route) {
        app.config.globalProperties.$route = route;
    }
    const vm = app.mount(host);
    return { host, vm, unmount: () => { app.unmount(); host.remove(); } };
}

const buttonLabels = (element) => [...element.querySelectorAll('button')].map((b) => b.textContent.trim());

// Nearby: short group titles, with Explore Here / What's Here? inside it.
{
    const calls = [];
    const { host, unmount } = mount({
        components: { CollapsibleSection, WorldEncounterCanvas: { template: '<div class="stub-canvas"></div>' } },
        data: () => ({
            cameraPosition: { x: 0, y: 0, z: 0 },
            primaryMode: WorldViewPrimaryMode.EXPLORE,
            WorldViewPrimaryMode,
            nearbyGeographicPlaces: [],
            nearbyLandmarkRows: [],
            nearbyPeopleRows: [],
            nearbyPlaceNamingClaimRows: [],
            placeNamingDiscoveryError: null,
            nearbySectionsCollapsed: { places: true, landmarks: true, people: true, placeNaming: true, worldEncounters: true }
        }),
        methods: {
            setNearbySectionCollapsed() {},
            exploreHere() { calls.push('exploreHere'); },
            whatsHere() { calls.push('whatsHere'); }
        },
        template: nearbySectionTemplate
    });
    const section = host.querySelector('.world-view-section--nearby');
    const titles = [...section.querySelectorAll('.collapsible-section-title')].map((t) => t.textContent.trim());
    assert(JSON.stringify(titles) === JSON.stringify(['Places', 'Landmarks', 'People', 'Place Names', 'World Encounters']),
        `the Nearby groups drop the repeated "Nearby" prefix — got ${titles.join(', ')}`);

    const exploreActions = section.querySelector('.world-view-actions--explore');
    assert(exploreActions && JSON.stringify(buttonLabels(exploreActions)) === JSON.stringify(['Explore Here', "What's Here?"]),
        'Explore Here and What\'s Here? sit inside the Nearby section');
    exploreActions.querySelectorAll('button').forEach((b) => b.click());
    assert(JSON.stringify(calls) === JSON.stringify(['exploreHere', 'whatsHere']), 'both still run their camera queries');
    unmount();
    console.log('✓ Nearby shows short group titles and holds the camera queries');
}

// Worlds in View is hidden while it would only repeat the header's World.
{
    const { host, vm, unmount } = mount({
        data: () => ({
            failedWorlds: [],
            nearbyWorlds: [],
            loadedWorlds: [{ documentId: 'current', title: 'A Pyramid with Stair', author: 'forkbuild' }]
        }),
        methods: { focusWorld() {} },
        template: `<div>${worldListsSectionTemplate}</div>`
    }, { route: { params: { documentId: 'current' } } });
    assert(!host.textContent.includes('Worlds in View'), 'only the current World in view: the list is hidden');

    vm.loadedWorlds.push({ documentId: 'other', title: 'Castle', author: 'alice' });
    await nextTick();
    assert(host.textContent.includes('Worlds in View (2)'), 'another World in view: the list shows, counting both');
    assert(host.querySelector('.world-item--current').textContent.includes('A Pyramid with Stair'), 'and still marks the current World');
    unmount();
    console.log('✓ Worlds in View shows only when it lists another World');
}

// The hover card renders outside the panel's inspection panels.
{
    const hover = { type: 'ground', worldTitle: 'Untitled', worldAuthor: 'anonymous', position: { x: 1, y: 0, z: 2 } };
    const inPanel = mount({
        components: { DocumentInfoPanel: {}, PlacementInfoPanel: {}, AvatarInfoPanel: {} },
        data: () => ({ spatialHover: hover, spatialInspection: null }),
        template: `<div>${inspectionPanelsTemplate}</div>`
    });
    assert(!inPanel.host.querySelector('.spatial-panel--hover'), 'the panel\'s inspection panels no longer render the hover card');
    inPanel.unmount();

    const card = mount({ data: () => ({ spatialHover: hover }), template: hoverCardTemplate });
    const element = card.host.querySelector('.world-view-hover-card');
    assert(element && element.textContent.includes('ground') && element.textContent.includes('World: Untitled'),
        'the floating hover card shows what is under the pointer');
    card.unmount();
    console.log('✓ the hover card floats outside the panel');
}

// Move Placement sits beside the Own Publication panel's Place action.
{
    const publication = { id: 'pub-1', title: 'A Pyramid with Stair', author: 'forkbuild', publisherIdentity: null };
    const placements = [{ placementId: 'p1', position: { x: 680, y: 0, z: 1600 }, revision: 1, owner: 'forkbuild' }];
    const { host, unmount } = mount({
        components: { OwnPublicationPanel },
        data: () => ({ publication }),
        methods: {
            distribute() {},
            place() {},
            placements() { return placements; }
        },
        template: `
            <OwnPublicationPanel
                :publication="publication"
                :snapshotDistributionCommand="distribute"
                :placePublicationCommand="place"
                :getPublicationPlacementsCommand="placements"
            >
                <template #placement-actions><button class="host-move">Move Placement</button></template>
            </OwnPublicationPanel>`
    });
    await nextTick();
    const actions = host.querySelector('.own-publication-placements .own-publication-placement-actions');
    assert(actions && JSON.stringify(buttonLabels(actions)) === JSON.stringify(['Place', 'Move Placement']),
        `Place and the host's Move Placement share one row — got ${actions ? buttonLabels(actions).join(', ') : 'no row'}`);
    const detail = host.querySelector('.own-publication-placement-detail');
    assert(detail.textContent.includes('680.0, 0.0, 1600.0'), 'the placement\'s position still renders');
    assert(getComputedStyle(detail).display === 'grid', 'placement details lay out as a compact label/value grid');
    unmount();
    console.log('✓ Move Placement sits beside Place');
}
