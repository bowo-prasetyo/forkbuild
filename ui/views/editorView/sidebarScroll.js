// Brings a card in the Editor's sidebar scroll up to its top, so the part of
// the sidebar that the next step needs is in view: the Build Library when
// Place is chosen, the Selection card when something is selected (finding
// P1-1 of docs/reviews/EditorUsability-2026-10-29.md).
//
// `onlyIfHidden` leaves the scroll alone while the card's top is already in
// view, so adding a brick to a selection doesn't make the sidebar jump.
// `onlyDown` keeps the old rule for the library: brought up when it is
// further down, never pulled back when it has already been scrolled into.
export function bringToTop(scroller, selector, { onlyIfHidden = false, onlyDown = false } = {}) {
    const card = scroller && scroller.querySelector(selector);
    if (!card) return false;
    const view = scroller.getBoundingClientRect();
    const top = card.getBoundingClientRect().top;
    if (onlyIfHidden && top >= view.top - 1 && top < view.bottom - 40) return false;
    const offset = top - view.top;
    if (onlyDown && offset <= 0) return false;
    if (Math.abs(offset) < 1) return false;
    scroller.scrollTop += offset;
    return true;
}

// The card for what is selected: bricks (SelectionInspector) or a placed
// build (StructureInstancePanel).
export const SELECTION_CARD = '.selection-inspector, .structure-instance-panel';
