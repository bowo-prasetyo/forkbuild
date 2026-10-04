// @environment browser
import { createApp, nextTick } from 'vue';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import CollapsibleSection from '../ui/components/CollapsibleSection.js';
import { nearbySectionTemplate } from '../ui/views/worldView/templates/nearbySection.js';
import { worldListsSectionTemplate } from '../ui/views/worldView/templates/worldListsSection.js';
import { inspectionPanelsTemplate } from '../ui/views/worldView/templates/inspectionPanels.js';
import { hoverCardTemplate } from '../ui/views/worldView/templates/hoverCard.js';
import { avatarSectionTemplate } from '../ui/views/worldView/templates/avatarSection.js';
import { residentRefusalLabel } from '../ui/components/avatarInteractionLabels.js';
import ResidentSpeechActions from '../ui/components/ResidentSpeechActions.js';
import { CameraPerspective } from '../core/CameraPerspective.js';
import { WorldViewPrimaryMode } from '../application/world/WorldViewNavigationState.js';
import { assert } from './support/Assert.js';
import { displayText, errorText, t } from '../ui/i18n/i18n.js';
import { compassText, spatialContextDescription } from '../ui/i18n/worldText.js';

// World View's left panel layout, rendered by real Vue in Chromium: the
// Nearby section's groups and camera actions, Worlds in View shown only
// when it adds something, the hover card kept out of the panel, and the
// Own Publication panel's per-placement Move and Remove.

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
    // The World View templates' translation helpers, as WorldView's setup() exposes them.
    Object.assign(app.config.globalProperties, { t, displayText, errorText, compassText, spatialContextDescription });
    if (route) {
        app.config.globalProperties.$route = route;
    }
    const vm = app.mount(host);
    return { host, vm, unmount: () => { app.unmount(); host.remove(); } };
}

const buttonLabels = (element) => [...element.querySelectorAll('button')].map((b) => b.textContent.trim());

// Nearby: short group titles, empty groups folded into one line, and
// Explore Here / What's Here? inside it.
{
    const calls = [];
    const { host, vm, unmount } = mount({
        components: { CollapsibleSection, WorldEncounterCanvas: { template: '<div class="stub-canvas"></div>' } },
        data: () => ({
            cameraPosition: { x: 0, y: 0, z: 0 },
            primaryMode: WorldViewPrimaryMode.EXPLORE,
            WorldViewPrimaryMode,
            nearbyGeographicPlaces: [],
            nearbyLandmarkRows: [],
            nearbyPeopleRows: [],
            nearbyPlaceNamingClaimRows: [],
            claimedBuildRows: [],
            placeNamingDiscoveryError: null,
            nearbySectionsCollapsed: { places: true, landmarks: true, people: true, placeNaming: true, worldEncounters: true, claimedBuilds: false }
        }),
        methods: {
            setNearbySectionCollapsed() {},
            exploreHere() { calls.push('exploreHere'); },
            whatsHere() { calls.push('whatsHere'); },
            navigateToClaimedBuild(build) { calls.push(['navigate', build.key]); },
            acceptClaimedBuild(build) { calls.push(['accept', build.key]); },
            verifyClaimedBuild(build) { calls.push(['verify', build.key]); },
            dismissClaimedBuild(build) { calls.push(['hide', build.key]); }
        },
        template: nearbySectionTemplate
    });
    const section = host.querySelector('.world-view-section--nearby');
    const titles = () => [...section.querySelectorAll('.collapsible-section-title')].map((t) => t.textContent.trim());
    assert(JSON.stringify(titles()) === JSON.stringify(['Place Names', 'World Encounters']),
        `with nothing nearby, only Place Names and World Encounters show as groups — got ${titles().join(', ')}`);
    assert(section.textContent.includes('No places, landmarks or people nearby yet.'), 'one line says the other three are empty');

    vm.nearbyLandmarkRows.push({ id: 'l1', title: 'Old Well', distance: 12, direction: 'N' });
    vm.nearbyPeopleRows.push({ identityId: 'p1', displayName: 'Bob', distance: 5, direction: 'E' });
    await nextTick();
    assert(JSON.stringify(titles()) === JSON.stringify(['Landmarks', 'People', 'Place Names', 'World Encounters']),
        `groups appear once they have something, without the "Nearby" prefix — got ${titles().join(', ')}`);
    assert(!section.textContent.includes('No places, landmarks or people nearby yet.'), 'and the empty line goes');

    const exploreActions = section.querySelector('.world-view-actions--explore');
    assert(exploreActions && JSON.stringify(buttonLabels(exploreActions)) === JSON.stringify(['Explore Here', "What's Here?"]),
        'Explore Here and What\'s Here? sit inside the Nearby section');
    exploreActions.querySelectorAll('button').forEach((b) => b.click());
    assert(JSON.stringify(calls) === JSON.stringify(['exploreHere', 'whatsHere']), 'both still run their camera queries');

    // Claimed Builds: only when there is one, with Navigate, Accept Position and Hide.
    calls.length = 0;
    vm.claimedBuildRows.push({
        key: 'pub-b:h', publicationId: 'pub-b', title: 'Bob\'s Tower', author: 'bob', distance: 50,
        position: { x: 40, y: 0, z: 30 }, acceptable: false, acceptanceHint: 'Its publisher\'s signed Publication isn\'t on this device yet.'
    });
    await nextTick();
    assert(JSON.stringify(titles()) === JSON.stringify(['Landmarks', 'People', 'Place Names', 'Claimed Builds', 'World Encounters']),
        `Claimed Builds appears once there is a claim — got ${titles().join(', ')}`);
    const claimRow = section.querySelector('.world-view-claimed-build-row');
    assert(claimRow.textContent.includes('Bob\'s Tower') && claimRow.textContent.includes('claimed by bob') && claimRow.textContent.includes('unverified'),
        'a claimed build row names the build and says its position is unverified');
    const claimButtons = [...claimRow.querySelectorAll('button')];
    assert(JSON.stringify(claimButtons.map((b) => b.textContent.trim())) === JSON.stringify(['Navigate', 'Accept Position', 'Hide']),
        'each row has Navigate, Accept Position and Hide');
    assert(claimButtons[1].disabled && claimRow.textContent.includes("isn't on this device yet"),
        'Accept Position is disabled with its reason until the claim can be verified');
    claimButtons[0].click();
    claimButtons[2].click();
    vm.claimedBuildRows[0].acceptable = true;
    await nextTick();
    claimRow.querySelectorAll('button')[1].click();
    assert(JSON.stringify(calls) === JSON.stringify([['navigate', 'pub-b:h'], ['hide', 'pub-b:h'], ['accept', 'pub-b:h']]),
        `the row's buttons act on that claim — got ${JSON.stringify(calls)}`);
    // Unverified with a Verify path: Verify sits beside Accept; once verified, the signer's key shows.
    calls.length = 0;
    Object.assign(vm.claimedBuildRows[0], { acceptable: false, canVerify: true });
    await nextTick();
    assert(JSON.stringify(buttonLabels(claimRow)) === JSON.stringify(['Navigate', 'Verify', 'Accept Position', 'Hide']),
        `Verify appears while the Publication is unknown — got ${buttonLabels(claimRow).join(', ')}`);
    claimRow.querySelector('.world-view-claimed-build-verify').click();
    assert(calls[0] && calls[0][0] === 'verify', 'Verify acts on that claim');
    Object.assign(vm.claimedBuildRows[0], { verifying: true });
    await nextTick();
    assert(claimRow.querySelector('.world-view-claimed-build-verify').disabled
        && claimRow.querySelector('.world-view-claimed-build-verify').textContent.trim() === 'Verifying…', 'and shows its progress');
    Object.assign(vm.claimedBuildRows[0], { verifying: false, canVerify: false, acceptable: true, signedBy: 'bob', publisherKey: 'did:key:z6MkhaXgBZDv…a1b2c3' });
    await nextTick();
    assert(claimRow.textContent.includes('signed by bob (key did:key:z6MkhaXgBZDv…a1b2c3)') && !claimRow.querySelector('.world-view-claimed-build-verify'),
        'once verified, the row names the signing key and Verify goes');
    unmount();
    console.log('✓ Nearby shows short group titles, folds empty ones, and holds the camera queries');
    console.log('✓ Claimed Builds lists nearby claims with Navigate, Accept Position and Hide');
}

// Avatar: without an avatar of your own, only what works shows.
{
    const avatarState = (hasLocalAvatar) => ({
        hasLocalAvatar, showMyAvatar: hasLocalAvatar, showOtherAvatars: true, avatarControlMode: false,
        followAvatar: false, cameraPerspective: null, CameraPerspective,
        remoteAvatarDiagnostics: { total: 0 }, nearbyAvatars: []
    });
    const avatarMethods = {
        toggleShowMyAvatar() {}, toggleShowOtherAvatars() {}, toggleAvatarControlMode() {},
        toggleFollowAvatar() {}, setCameraPerspective() {}, selectNearbyAvatar() {}
    };
    const toggleLabels = (host) => [...host.querySelectorAll('.world-view-avatar-toggle')].map((l) => l.textContent.trim());

    const loggedOut = mount({
        components: { NearbyAvatarsPanel: { template: '<div></div>' } },
        data: () => avatarState(false), methods: avatarMethods, template: avatarSectionTemplate
    });
    assert(JSON.stringify(toggleLabels(loggedOut.host)) === JSON.stringify(['Show Other Avatars']),
        `without an avatar only Show Other Avatars shows — got ${toggleLabels(loggedOut.host).join(', ')}`);
    assert(!loggedOut.host.querySelector('.world-view-camera-perspective'), 'and no camera perspective buttons');
    assert(loggedOut.host.textContent.includes('create an avatar'), 'the hint says how to get an avatar');
    assert(!loggedOut.host.querySelector('input:disabled, button:disabled'), 'nothing disabled is left on screen');
    loggedOut.unmount();

    const withAvatar = mount({
        components: { NearbyAvatarsPanel: { template: '<div></div>' } },
        data: () => avatarState(true), methods: avatarMethods, template: avatarSectionTemplate
    });
    assert(toggleLabels(withAvatar.host).length === 4 && withAvatar.host.querySelector('.world-view-camera-perspective'),
        'with an avatar, all four toggles and the camera perspectives show');
    withAvatar.unmount();
    console.log('✓ Avatar shows only usable controls');
}

// Avatar: the Residents row — one button that does what R would, or the
// reason neither is possible, never a disabled button.
{
    const toggled = [];
    const { host, vm, unmount } = mount({
        components: { NearbyAvatarsPanel: { template: '<div></div>' } },
        data: () => ({
            hasLocalAvatar: true, showMyAvatar: true, showOtherAvatars: true, avatarControlMode: true,
            followAvatar: false, cameraPerspective: null, CameraPerspective,
            remoteAvatarDiagnostics: { total: 0 }, nearbyAvatars: [],
            residentInteractionState: { canAdd: true, canRemove: false, refusal: null, targetResidentId: null }
        }),
        methods: {
            toggleShowMyAvatar() {}, toggleShowOtherAvatars() {}, toggleAvatarControlMode() {},
            toggleFollowAvatar() {}, setCameraPerspective() {}, selectNearbyAvatar() {},
            toggleResidentHere() { toggled.push(true); },
            talkToResident() { toggled.push('talk'); },
            residentRefusalLabel: residentRefusalLabel
        },
        template: avatarSectionTemplate
    });
    const row = () => host.querySelector('.world-view-residents');
    assert(JSON.stringify(buttonLabels(row())) === JSON.stringify(['Add Resident Here']), 'on open ground the row offers Add Resident Here');
    row().querySelector('button').click();
    assert(toggled.length === 1, 'which does what R would');
    vm.residentInteractionState = { canAdd: false, canRemove: true, refusal: null, targetResidentId: 'r' };
    await nextTick();
    assert(JSON.stringify(buttonLabels(row())) === JSON.stringify(['Remove Resident']), 'next to a resident it offers Remove Resident');
    vm.residentInteractionState = { canAdd: false, canRemove: true, canTalk: true, refusal: null, targetResidentId: 'r' };
    await nextTick();
    assert(JSON.stringify(buttonLabels(row())) === JSON.stringify(['Talk', 'Remove Resident']), 'and Talk, when it can be talked to');
    row().querySelector('button').click();
    assert(toggled[toggled.length - 1] === 'talk', 'Talk does what T would');
    vm.residentInteractionState = { canAdd: false, canRemove: false, refusal: 'not-on-ground', targetResidentId: null };
    await nextTick();
    assert(buttonLabels(row()).length === 0 && row().textContent.includes('step down'), 'up on something it says why, with no button');
    assert(!host.querySelector('.world-view-residents button:disabled'), 'and nothing disabled is left on screen');
    vm.residentInteractionState = null;
    await nextTick();
    assert(!row(), 'without a state (no avatar) the row is gone');
    unmount();
    console.log('✓ Avatar offers one usable Residents action, or says why not');
}

// What a resident just mentioned: one Focus button each, nothing when empty.
{
    const focused = [];
    const { host, vm, unmount } = mount({
        components: { ResidentSpeechActions },
        data: () => ({ targets: [] }),
        methods: { onFocus(index) { focused.push(index); } },
        template: '<div style="position: relative; width: 800px; height: 600px"><ResidentSpeechActions :targets="targets" @focus="onFocus" /></div>'
    });
    assert(!host.querySelector('.resident-speech-actions'), 'with nothing mentioned, no Focus buttons');
    vm.targets = [
        { kind: 'STRUCTURE', label: 'Old Mill', position: { x: 0, z: 30 } },
        { kind: 'BUILD', label: '<b>Hill Fort</b>', position: { x: 0, z: 3000 } }
    ];
    await nextTick();
    const row = host.querySelector('.resident-speech-actions');
    assert(JSON.stringify(buttonLabels(row)) === JSON.stringify(['Focus: Old Mill', 'Focus: <b>Hill Fort</b>']),
        `one Focus button per mentioned thing, labels as plain text — got ${buttonLabels(row).join(', ')}`);
    assert(!row.querySelector('b'), 'a label is never markup');
    row.querySelectorAll('button')[1].click();
    assert(focused.length === 1 && focused[0] === 1, 'Focus emits which one');
    assert(getComputedStyle(row).position === 'absolute', 'the row floats over the view, from the real stylesheet');
    unmount();
    console.log('✓ A resident\'s mentions get Focus buttons');
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

// Each Placements row carries its own Move and Remove; Add Placement Here stays under the list.
{
    const publication = { id: 'pub-1', title: 'A Pyramid with Stair', author: 'forkbuild', publisherIdentity: null };
    const placements = [
        { placementId: 'p1', publicationId: 'pub-1', position: { x: 680, y: 0, z: 1600 }, revision: 1, owner: 'forkbuild', movable: true, removable: true },
        { placementId: 'p2', publicationId: 'pub-1', position: { x: 1095, y: 0, z: 2455 }, revision: 1, owner: 'alice', movable: false, removable: false }
    ];
    const calls = [];
    const { host, unmount } = mount({
        components: { OwnPublicationPanel },
        data: () => ({ publication }),
        methods: {
            distribute() {},
            place() {},
            placements() { return placements; },
            move(placement) { calls.push(['move', placement.placementId]); },
            remove(placement) { calls.push(['remove', placement.placementId]); }
        },
        template: `
            <OwnPublicationPanel
                :publication="publication"
                :snapshotDistributionCommand="distribute"
                :placePublicationCommand="place"
                :getPublicationPlacementsCommand="placements"
                :movePlacementCommand="move"
                :removePlacementCommand="remove"
            />`
    });
    await nextTick();
    const actions = host.querySelector('.own-publication-placements .own-publication-placement-actions');
    assert(actions && JSON.stringify(buttonLabels(actions)) === JSON.stringify(['Add Placement Here']),
        `Add Placement Here sits under the list — got ${actions ? buttonLabels(actions).join(', ') : 'no row'}`);
    const rows = [...host.querySelectorAll('.own-publication-placement-entry')];
    assert(rows.length === 2, 'one row per placement');
    const rowButtons = (row) => [...row.querySelectorAll('.own-publication-placement-row-actions button')];
    assert(JSON.stringify(rowButtons(rows[0]).map((b) => b.textContent.trim())) === JSON.stringify(['Move…', 'Remove…']),
        'each row has its own Move… and Remove…');
    assert(rowButtons(rows[0]).every((b) => !b.disabled), 'your own copy\'s buttons are enabled');
    assert(rowButtons(rows[1]).every((b) => b.disabled), 'someone else\'s copy\'s buttons are disabled');
    const detail = rows[0].querySelector('.own-publication-placement-detail');
    assert(detail.textContent.includes('680.0, 0.0, 1600.0'), 'the placement\'s position still renders');
    assert(getComputedStyle(detail).display === 'grid', 'placement details lay out as a compact label/value grid');

    rowButtons(rows[0])[0].click();
    assert(calls[0] && calls[0][0] === 'move' && calls[0][1] === 'p1', 'Move… hands that row\'s placement to the host');

    rowButtons(rows[0])[1].click();
    await nextTick();
    const confirm = rows[0].querySelector('.own-publication-placement-remove-confirm');
    assert(confirm && /other placements/.test(confirm.textContent), 'Remove… first asks, naming what stays');
    assert(calls.length === 1, 'nothing is removed before confirming');
    confirm.querySelector('.own-publication-placement-remove-action').click();
    await nextTick();
    assert(calls[1] && calls[1][0] === 'remove' && calls[1][1] === 'p1', 'confirming removes exactly that row\'s placement');
    assert(!rows[0].querySelector('.own-publication-placement-remove-confirm'), 'the confirmation closes');
    unmount();
    console.log('✓ each placement row has its own Move and Remove');
}

// The publication panel: Distribute up front, the rest behind More, Unpublish
// only after a confirmation, and Commentary collapsed to one line.
{
    // Unsigned (legacy) Publications count as the viewer's own.
    const publication = { id: 'pub-2', title: 'A Pyramid with Stair', author: 'forkbuild', publisherIdentity: null };
    const unpublished = [];
    const { host, unmount } = mount({
        components: { OwnPublicationPanel },
        data: () => ({ publication }),
        methods: {
            distribute() {},
            exportSnapshot() {},
            discoverSnapshot() {},
            discoverCandidates() {},
            unpublish(p) { unpublished.push(p.id); return true; },
            commentaries() { return [{ commentaryId: 'c1', authorIdentityId: 'bob', content: 'nice stairs' }]; }
        },
        template: `
            <OwnPublicationPanel
                :publication="publication"
                :snapshotDistributionCommand="distribute"
                :exportSnapshotCommand="exportSnapshot"
                :discoverSnapshotCommand="discoverSnapshot"
                :discoverSnapshotCandidatesCommand="discoverCandidates"
                :unpublishCommand="unpublish"
                :getPublicationCommentariesCommand="commentaries"
            />`
    });
    await nextTick();
    const panel = host.querySelector('.own-publication-panel');
    const directButtons = () => [...panel.children].filter((e) => e.tagName === 'BUTTON').map((b) => b.textContent.trim());
    assert(JSON.stringify(directButtons()) === JSON.stringify(['Distribute', 'More ▾']),
        `only Distribute and More show up front — got ${directButtons().join(', ')}`);
    assert(!panel.querySelector('.own-publication-export-action'), 'Export Snapshot waits behind More');

    panel.querySelector('.own-publication-more-trigger').click();
    await nextTick();
    const more = panel.querySelector('.own-publication-more-actions');
    assert(JSON.stringify(buttonLabels(more)) === JSON.stringify(['Export Snapshot', 'Check Snapshot Match', 'Diagnostic Tools', 'Unpublish…']),
        `More holds the less frequent actions — got ${buttonLabels(more).join(', ')}`);
    assert(panel.querySelector('.own-publication-more-trigger').getAttribute('aria-expanded') === 'true', 'More reports it is open');

    more.querySelector('.own-publication-unpublish-request-action').click();
    await nextTick();
    assert(unpublished.length === 0, 'the first Unpublish click only asks');
    assert(more.textContent.includes('Remove this World from your Repository on this device?'), 'and says what unpublishing does');
    more.querySelector('.own-publication-unpublish-cancel-action').click();
    await nextTick();
    assert(unpublished.length === 0 && more.querySelector('.own-publication-unpublish-request-action'), 'Cancel backs out without unpublishing');
    more.querySelector('.own-publication-unpublish-request-action').click();
    await nextTick();
    more.querySelector('.own-publication-unpublish-action').click();
    await nextTick();
    assert(JSON.stringify(unpublished) === JSON.stringify(['pub-2']), 'confirming unpublishes exactly once');

    const toggle = panel.querySelector('.own-publication-commentary-toggle');
    const body = panel.querySelector('.own-publication-commentary-body');
    assert(toggle.textContent.includes('Commentary (1)') && getComputedStyle(body).display === 'none',
        'Commentary starts as one line that still counts the comments');
    toggle.click();
    await nextTick();
    assert(getComputedStyle(body).display !== 'none' && body.textContent.includes('nice stairs'), 'opening it shows them');
    unmount();
    console.log('✓ the publication panel keeps rare actions behind More and confirms Unpublish');
}
