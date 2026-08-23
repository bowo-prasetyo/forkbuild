import { WorldViewNavigationState, WorldViewPrimaryMode } from '../application/WorldViewNavigationState.js';

// 0.5.7 — World View UX & Progressive Exploration.
//
// World View's growing toolbar (Locations, Map, Geographic Places,
// Explore, each its own always-on-top modal with nothing coordinating
// them) is exactly the "surface exposing too many controls at once"
// problem this milestone reorganizes around three PRIMARY modes —
// Explore / Map / Places — plus a little UI memory (which Places
// screen was open, which "Nearby ___" sections are collapsed, whether
// a place's naming claims are expanded) that should survive switching
// between them.
//
// application/WorldViewNavigationState.js is a thin, pure module — no
// Vue, no DOM, no session, no World access of any kind — so this suite
// tests it exactly the way tests/CommandPalette.test.js tests
// EditorActionRegistry/InputRouter: headlessly, as the one place any of
// this milestone's actual DECISIONS live. ui/views/WorldView.js's own
// template is a thin reflection of this state, the same "dumb panel,
// smart host" split (inverted: here the HOST is the thin layer over a
// pure module) every other modal in this codebase already follows.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// ---------------------------------------------------------------------
// 1. Explore is the default primary mode
// ---------------------------------------------------------------------
{
    const nav = new WorldViewNavigationState();
    assert(nav.primaryMode === WorldViewPrimaryMode.EXPLORE, 'World View opens in Explore mode');
    assert(nav.currentPlacesView.screen === 'directory', 'Places starts at its directory screen');
}

// ---------------------------------------------------------------------
// 2. Only one primary mode is ever active
// ---------------------------------------------------------------------
{
    const nav = new WorldViewNavigationState();
    assert(nav.setPrimaryMode(WorldViewPrimaryMode.MAP) === true, 'switching to Map is accepted');
    assert(nav.primaryMode === WorldViewPrimaryMode.MAP, 'Map is now current');
    assert(nav.setPrimaryMode(WorldViewPrimaryMode.PLACES) === true, 'switching to Places is accepted');
    assert(nav.primaryMode === WorldViewPrimaryMode.PLACES, 'Places is now current — Map is no longer current');
    assert(nav.primaryMode !== WorldViewPrimaryMode.MAP, 'the previous mode is not still active alongside the new one');

    // An unknown mode is rejected outright — never silently accepted,
    // never left in some hybrid state.
    const before = nav.primaryMode;
    assert(nav.setPrimaryMode('editing') === false, 'an unrecognized mode is rejected');
    assert(nav.setPrimaryMode(null) === false, 'null is rejected');
    assert(nav.setPrimaryMode(undefined) === false, 'undefined is rejected');
    assert(nav.primaryMode === before, 'a rejected mode change leaves the current mode untouched');
}

// ---------------------------------------------------------------------
// 3. Places: directory -> detail -> Back
// ---------------------------------------------------------------------
{
    const nav = new WorldViewNavigationState();
    nav.setPrimaryMode(WorldViewPrimaryMode.PLACES);
    assert(nav.currentPlacesView.screen === 'directory', 'Places opens on its directory');

    nav.openPlaceDetail('kawahara-village');
    assert(nav.currentPlacesView.screen === 'detail', 'opening a row moves to its detail screen');
    assert(nav.currentPlacesView.fingerprintKey === 'kawahara-village', 'the detail screen remembers which place');

    nav.goBackInPlaces();
    assert(nav.currentPlacesView.screen === 'directory', 'Back returns to the directory');
    assert(nav.currentPlacesView.fingerprintKey === undefined, 'the directory view carries no leftover place key');

    // Back on an already-collapsed stack (no detail open) is a no-op,
    // never an error and never something that "pops" past the directory.
    nav.goBackInPlaces();
    assert(nav.currentPlacesView.screen === 'directory', 'Back at the directory stays at the directory');
}

// ---------------------------------------------------------------------
// 4. Mode switching preserves Places' own screen
// ---------------------------------------------------------------------
{
    const nav = new WorldViewNavigationState();
    nav.setPrimaryMode(WorldViewPrimaryMode.PLACES);
    nav.openPlaceDetail('old-market');

    // Leaving Places for Map and coming back does NOT reset the
    // detail screen — this is the "mode switching preserves
    // appropriate state" guarantee: browsing the map and returning to
    // Places should not lose your place.
    nav.setPrimaryMode(WorldViewPrimaryMode.MAP);
    assert(nav.currentPlacesView.screen === 'detail', 'Places state survives switching away to Map');
    nav.setPrimaryMode(WorldViewPrimaryMode.PLACES);
    assert(nav.currentPlacesView.fingerprintKey === 'old-market', 'the exact place is still remembered on return');

    // A genuinely fresh directory open (not just returning to the
    // mode) DOES reset — the distinction WorldView.js's own
    // openGeographicPlaceDirectory() relies on.
    nav.openPlacesDirectory();
    assert(nav.currentPlacesView.screen === 'directory', 'openPlacesDirectory() resets to the list');
}

// ---------------------------------------------------------------------
// 5. Collapsible sections — default, toggle, independence
// ---------------------------------------------------------------------
{
    const nav = new WorldViewNavigationState();

    assert(nav.isSectionCollapsed('explore:places') === true, 'a never-touched section defaults to collapsed');
    assert(nav.isSectionCollapsed('explore:landmarks', false) === false, 'a caller may choose a different default');

    assert(nav.toggleSection('explore:places') === false, 'toggling an implicitly-collapsed section expands it');
    assert(nav.isSectionCollapsed('explore:places') === false, 'the expanded state sticks');
    assert(nav.toggleSection('explore:places') === true, 'toggling again re-collapses it');

    nav.setSectionCollapsed('explore:people', false);
    assert(nav.isSectionCollapsed('explore:people') === false, 'setSectionCollapsed sets an explicit value');

    // Independence: expanding one section never touches another's
    // state, including one that was never explicitly set.
    assert(nav.isSectionCollapsed('explore:landmarks') === true, 'an unrelated section keeps its own default');

    // Once explicitly set, a caller-passed default no longer applies —
    // the viewer's own choice wins.
    nav.setSectionCollapsed('explore:landmarks', false);
    assert(nav.isSectionCollapsed('explore:landmarks', true) === false, 'an explicit choice overrides a later default argument');
}

// ---------------------------------------------------------------------
// 6. Section state survives primary-mode switches
// ---------------------------------------------------------------------
{
    const nav = new WorldViewNavigationState();
    nav.setSectionCollapsed('explore:places', false);
    nav.setPrimaryMode(WorldViewPrimaryMode.MAP);
    nav.setPrimaryMode(WorldViewPrimaryMode.PLACES);
    nav.setPrimaryMode(WorldViewPrimaryMode.EXPLORE);
    assert(nav.isSectionCollapsed('explore:places') === false, 'a section\'s collapsed state outlives mode switching');
}

// ---------------------------------------------------------------------
// 7. Naming disclosure — per-region, never leaking
// ---------------------------------------------------------------------
{
    const nav = new WorldViewNavigationState();
    assert(nav.isNamingExpanded('region-a') === false, 'naming claims default to the collapsed summary');

    nav.setNamingExpanded('region-a', true);
    assert(nav.isNamingExpanded('region-a') === true, 'expanding a region\'s names sticks');
    assert(nav.isNamingExpanded('region-b') === false, 'a different region is unaffected — no leakage');

    nav.setNamingExpanded('region-a', false);
    assert(nav.isNamingExpanded('region-a') === false, 'a region can be re-collapsed');

    // A falsy/missing region id is simply ignored — never throws, never
    // pollutes the set with an undefined/null entry.
    nav.setNamingExpanded(null, true);
    assert(nav.isNamingExpanded(null) === false, 'a null region id is never recorded as expanded');
}

// ---------------------------------------------------------------------
// 8. reset() returns every field to its construction-time default
// ---------------------------------------------------------------------
{
    const nav = new WorldViewNavigationState();
    nav.setPrimaryMode(WorldViewPrimaryMode.PLACES);
    nav.openPlaceDetail('somewhere');
    nav.setSectionCollapsed('explore:places', false);
    nav.setNamingExpanded('region-a', true);

    nav.reset();

    assert(nav.primaryMode === WorldViewPrimaryMode.EXPLORE, 'reset() returns to Explore');
    assert(nav.currentPlacesView.screen === 'directory', 'reset() returns Places to its directory');
    assert(nav.isSectionCollapsed('explore:places') === true, 'reset() clears remembered section state');
    assert(nav.isNamingExpanded('region-a') === false, 'reset() clears remembered naming disclosure');
}

// ---------------------------------------------------------------------
// 9. This module never mutates or reads anything but its own fields —
//    "Navigate ≠ Modify" holds even at the type level: it has no
//    surface through which it COULD reach a session or the World.
// ---------------------------------------------------------------------
{
    const nav = new WorldViewNavigationState();
    assert(typeof nav.setPrimaryMode === 'function', 'exposes setPrimaryMode');
    assert(typeof nav.openPlaceDetail === 'function', 'exposes openPlaceDetail');
    assert(typeof nav.goBackInPlaces === 'function', 'exposes goBackInPlaces');
    // No method on this class is named/shaped like a mutation of World
    // content (save/publish/create/remove/move/grant/revoke) — the
    // entire public surface is navigation-shaped (get/set/toggle/open/
    // reset on this instance's OWN fields only).
    const mutationLikeNames = ['save', 'publish', 'createRegion', 'removeLandmark', 'grant', 'revoke', 'move'];
    for (const name of mutationLikeNames) {
        assert(typeof nav[name] === 'undefined', `WorldViewNavigationState exposes no "${name}" — it cannot mutate World content`);
    }
    // And the instance itself carries no reference to a session/world —
    // only its own plain bookkeeping fields.
    assert(nav.session === undefined && nav.world === undefined, 'the instance holds no session/world reference');
}

// ---------------------------------------------------------------------
// 10. Two independent instances never share state
// ---------------------------------------------------------------------
{
    const a = new WorldViewNavigationState();
    const b = new WorldViewNavigationState();
    a.setPrimaryMode(WorldViewPrimaryMode.MAP);
    a.setSectionCollapsed('explore:places', false);
    assert(b.primaryMode === WorldViewPrimaryMode.EXPLORE, 'a second instance is unaffected by the first\'s mode');
    assert(b.isSectionCollapsed('explore:places') === true, 'a second instance is unaffected by the first\'s section state');
}
