import { ref, onBeforeUnmount } from 'vue';

// Phone layouts start at this width; css/main/touch-and-compact.css uses the
// same breakpoint.
export const COMPACT_LAYOUT_QUERY = '(max-width: 720px)';

// Any touch screen, even one beside a mouse, so a touch laptop gets the
// touch controls too.
export const TOUCH_INPUT_QUERY = '(any-pointer: coarse)';

// A ref that follows a CSS media query, e.g. whether to show touch controls.
// False where matchMedia is missing.
export function useMediaQuery(query) {
    const list = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query)
        : null;
    const matches = ref(Boolean(list && list.matches));
    if (list) {
        const onChange = (event) => { matches.value = event.matches; };
        list.addEventListener('change', onChange);
        onBeforeUnmount(() => list.removeEventListener('change', onChange));
    }
    return matches;
}
