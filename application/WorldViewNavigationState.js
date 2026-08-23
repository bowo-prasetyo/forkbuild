// 0.5.7 — World View UX & Progressive Exploration.
//
// World View's own navigation surfaces (Locations, the World Map, the
// Geographic Place Directory, the arrival/"Explore" welcome panel) grew
// one milestone at a time — 0.2.94, 0.3.9, 0.5.1, 0.5.5, 0.5.6 — each
// adding its own toolbar button and its own always-on-top modal, with
// nothing anywhere deciding that only ONE of them should ever be open
// at a time, or remembering where inside one of them the viewer was
// when they stepped away to look at another. This is the ONE new
// concept 0.5.7 introduces: a small, pure, framework-free state module
// that owns exactly those two things —
//
//   1. which of the three PRIMARY modes (Explore / Map / Places) is
//      current, mutually exclusive by construction — never two at
//      once, the same way `session.getActiveDocumentId()` is always
//      exactly one document, never a set;
//   2. a few pieces of small, per-surface UI memory that should
//      SURVIVE switching modes and coming back — which screen the
//      Places directory was showing (list vs. one place's detail),
//      whether a given "Nearby ___" section is collapsed, whether a
//      given place's naming claims are shown in full or as a summary.
//
// This module is deliberately NOT a Vue reactive object and deliberately
// owns no reference to WorldNavigationSession, any core/ entity, or any
// component. It is pure UI navigation bookkeeping — see
// docs/Principles.md's own recurring claim that "Navigate ≠ Modify":
// nothing in this file can load a document, move a camera, or touch a
// single bit of World content. ui/views/WorldView.js is the ONLY
// caller — it creates one instance per session (mirroring how it
// already creates one WorldNavigationSession), calls its methods
// exactly the way it already calls session.focusLocation()/
// session.getMapContent() etc., and mirrors whatever this returns into
// its own refs so the template can react to it. See that file's own
// "0.5.7" comments for the wiring.
export const WorldViewPrimaryMode = Object.freeze({
    EXPLORE: 'explore',
    MAP: 'map',
    PLACES: 'places'
});

const VALID_PRIMARY_MODES = new Set(Object.values(WorldViewPrimaryMode));

// The Places surface has exactly two screens — never a deeper stack.
// A directory row opens exactly one detail screen (see
// ui/components/GeographicPlaceDirectoryPanel.js's own `open-place`
// emit); a detail screen's own "Back" always returns to the directory
// it came from, never to another detail screen — so "a screen and,
// when it's DETAIL, which place" is the entire shape, not a general
// history stack.
const PlacesScreen = Object.freeze({ DIRECTORY: 'directory', DETAIL: 'detail' });

export class WorldViewNavigationState {
    constructor() {
        this._primaryMode = WorldViewPrimaryMode.EXPLORE;
        this._placesScreen = PlacesScreen.DIRECTORY;
        this._placesDetailKey = null;
        // Collapsed-by-default per docs/Principles.md's own progressive-
        // disclosure framing (see this milestone's design conversation,
        // point 3): a section starts collapsed unless the caller says
        // otherwise via `defaultCollapsed` on first read.
        this._collapsedSections = new Map();
        // Naming disclosure is scoped PER REGION — expanding "Community
        // Names" for one place never expands it for another; see
        // isNamingExpanded()'s own comment.
        this._expandedNaming = new Set();
    }

    // ---------------------------------------------------------------
    // Primary mode — Explore / Map / Places
    // ---------------------------------------------------------------

    get primaryMode() {
        return this._primaryMode;
    }

    // Mutually exclusive by construction: `_primaryMode` is a single
    // field, never a collection, so there is no representable state
    // where two modes are simultaneously "current." An unknown mode is
    // rejected (returns false, leaves the current mode untouched)
    // rather than silently accepted — the same "closed vocabulary"
    // discipline core/WorldLocationKind.js already established for
    // WorldLocation kinds.
    setPrimaryMode(mode) {
        if (!VALID_PRIMARY_MODES.has(mode)) {
            return false;
        }
        this._primaryMode = mode;
        return true;
    }

    // ---------------------------------------------------------------
    // Places — directory / detail, with "Back"
    // ---------------------------------------------------------------

    // `{ screen: 'directory' }` or `{ screen: 'detail', fingerprintKey }`.
    // A plain snapshot object (never the internal fields themselves) so
    // a caller can't mutate this state by poking at the return value.
    get currentPlacesView() {
        return this._placesScreen === PlacesScreen.DETAIL
            ? { screen: PlacesScreen.DETAIL, fingerprintKey: this._placesDetailKey }
            : { screen: PlacesScreen.DIRECTORY };
    }

    // Opening the directory fresh (e.g. the "Places" primary-mode
    // button itself, or a brand-new directory query) always resets
    // straight to the list — see this method's callers in WorldView.js
    // for the distinction from switching AWAY from and back TO Places
    // mode without re-opening the directory, which deliberately does
    // NOT call this and so preserves whatever detail screen was open.
    openPlacesDirectory() {
        this._placesScreen = PlacesScreen.DIRECTORY;
        this._placesDetailKey = null;
    }

    // A directory row was opened — always reachable from the
    // directory, never from another detail screen (see this class's
    // own header), so "Back" from here always means "the directory."
    openPlaceDetail(fingerprintKey) {
        this._placesScreen = PlacesScreen.DETAIL;
        this._placesDetailKey = fingerprintKey || null;
    }

    // Idempotent at the directory: going "Back" when already at the
    // directory is a no-op, never an error and never a deeper pop —
    // there is nothing further back to go.
    goBackInPlaces() {
        this._placesScreen = PlacesScreen.DIRECTORY;
        this._placesDetailKey = null;
    }

    // ---------------------------------------------------------------
    // Collapsible sections
    // ---------------------------------------------------------------
    //
    // Keyed by an arbitrary, caller-chosen section id (e.g.
    // "explore:places", "explore:landmarks") — deliberately independent
    // of `_primaryMode`, so switching from Explore to Map and back
    // leaves every section exactly as collapsed/expanded as the viewer
    // left it (point 2 of the design conversation: "mode switching
    // preserves appropriate state").

    // `defaultCollapsed` only matters the FIRST time a given id is
    // asked about; once a caller has explicitly toggled/set it, that
    // choice sticks regardless of what default is passed on a later
    // call — a component re-mounting with its own idea of the default
    // can never quietly override a viewer's own choice.
    isSectionCollapsed(sectionId, defaultCollapsed = true) {
        if (!this._collapsedSections.has(sectionId)) {
            return !!defaultCollapsed;
        }
        return this._collapsedSections.get(sectionId);
    }

    setSectionCollapsed(sectionId, collapsed) {
        this._collapsedSections.set(sectionId, !!collapsed);
    }

    toggleSection(sectionId, defaultCollapsed = true) {
        const next = !this.isSectionCollapsed(sectionId, defaultCollapsed);
        this._collapsedSections.set(sectionId, next);
        return next;
    }

    // ---------------------------------------------------------------
    // Naming disclosure — ui/components/PlaceNamingPanel.js
    // ---------------------------------------------------------------
    //
    // A place's "Community Names" list defaults to a short summary
    // (see PlaceNamingPanel's own `namesExpanded` — this module tracks
    // the disclosure choice PER REGION so re-opening the SAME place's
    // names later remembers whether it was expanded, without leaking
    // that choice onto an unrelated region).

    isNamingExpanded(regionId) {
        return this._expandedNaming.has(regionId);
    }

    setNamingExpanded(regionId, expanded) {
        if (!regionId) return;
        if (expanded) {
            this._expandedNaming.add(regionId);
        } else {
            this._expandedNaming.delete(regionId);
        }
    }

    // ---------------------------------------------------------------
    // Reset — a fresh World, or leaving World View entirely
    // ---------------------------------------------------------------
    //
    // Deliberately clears everything back to construction-time
    // defaults, including collapsed-section/naming memory — this is UI
    // navigation state scoped to "this visit," not a durable per-viewer
    // preference (contrast application/LocalNamePreferenceStore.js,
    // which IS meant to persist). Never called automatically by this
    // class itself; the host decides when a visit has ended.
    reset() {
        this._primaryMode = WorldViewPrimaryMode.EXPLORE;
        this._placesScreen = PlacesScreen.DIRECTORY;
        this._placesDetailKey = null;
        this._collapsedSections.clear();
        this._expandedNaming.clear();
    }
}
